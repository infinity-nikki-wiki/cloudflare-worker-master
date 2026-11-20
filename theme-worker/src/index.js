import { applyThemeRewriter } from "./theme-cookies.js";

const NON_PAGE_PREFIXES = [
	"/api/",
	"/images/",
	"/resources/",
	"/extensions/",
	"/skins/",
	"/vendor/",
	"/cdn-cgi/",
];
const PHP_ENTRYPOINT = /\.php$/i;
const BYPASS_COOKIE_SUFFIXES = ["_session", "userid", "username", "token", "loggedout"];

const EDGE_CACHE_TTL_BY_STATUS = {
	"200-299": 300,
	"404": 10,
	"500-599": -1,
};

function safeDecode(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function getCookieNames(cookieHeader) {
	const names = [];
	for (const part of cookieHeader.split(";")) {
		const eq = part.indexOf("=");
		const name = (eq === -1 ? part : part.slice(0, eq)).trim();
		if (name) names.push(name);
	}
	return names;
}

function hasSessionCookie(request) {
	const cookieHeader = request.headers.get("Cookie") || "";
	if (!cookieHeader) return false;
	return getCookieNames(cookieHeader).some((name) => {
		const lower = name.toLowerCase();
		return BYPASS_COOKIE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
	});
}

function getPageTitle(url) {
	const pathname = url.pathname;
	if (NON_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

	if (pathname === "/index.php") {
		const title = url.searchParams.get("title");
		if (title) return safeDecode(title);
		return url.search === "" ? "Main_Page" : null;
	}
	if (PHP_ENTRYPOINT.test(pathname)) return null;
	if (pathname === "/") return "Main_Page";

	return safeDecode(pathname.slice(1));
}

function isSpecialTitle(title) {
	return title.replace(/^\s+/, "").toLowerCase().startsWith("special:");
}

function hasOnlyViewParams(url) {
	if (url.search === "") return true;
	for (const [key, value] of url.searchParams) {
		if (key === "title" && url.pathname === "/index.php") continue;
		if (key === "action" && value === "view") continue;
		return false;
	}
	return true;
}

function isCacheableRequest(request, url) {
	if (request.method !== "GET" && request.method !== "HEAD") return false;
	if (request.headers.has("Authorization")) return false;

	const title = getPageTitle(url);
	if (title === null || isSpecialTitle(title)) return false;
	if (!hasOnlyViewParams(url)) return false;
	if (hasSessionCookie(request)) return false;

	return true;
}

function getCacheTags(url) {
	const tags = ["wiki-page"];
	const title = getPageTitle(url);
	if (title) {
		const tag = "page:" + encodeURIComponent(title.replace(/ /g, "_"));
		if (tag.length <= 1024) tags.push(tag);
	}
	return tags;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		let finalRequest = request;

		if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
			url.hostname = env.DEV_UPSTREAM_HOST || "infinitynikki.wiki";
			url.protocol = "https:";
			url.port = "";
			finalRequest = new Request(url, request);
		}

		const finalUrl = new URL(finalRequest.url);
		const isPageRequest = getPageTitle(finalUrl) !== null;
		const shouldCache = isCacheableRequest(finalRequest, finalUrl);

		const fetchOptions = shouldCache
			? {
					cf: {
						cacheEverything: true,
						cacheTtlByStatus: EDGE_CACHE_TTL_BY_STATUS,
						cacheTags: getCacheTags(finalUrl),
					},
				}
			: isPageRequest || PHP_ENTRYPOINT.test(finalUrl.pathname)
				? {
						cf: {
							cacheEverything: false,
							cacheTtl: -1,
						},
					}
				: {};

		let originResponse;
		try {
			originResponse = await fetch(finalRequest, fetchOptions);
		} catch (err) {
			console.error("origin fetch failed:", err);
			return new Response("Origin unreachable", {
				status: 502,
				headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
			});
		}

		const contentType = originResponse.headers.get("Content-Type") || "";
		if (!contentType.toLowerCase().includes("text/html")) {
			return originResponse;
		}

		const rewriter = new HTMLRewriter();
		try {
			applyThemeRewriter(rewriter, finalRequest);
		} catch (err) {
			console.error("theme rewriter failed:", err);
		}

		const transformedResponse = rewriter.transform(originResponse);
		const responseHeaders = new Headers(transformedResponse.headers);
		responseHeaders.set("Cache-Control", "private, no-cache");
		responseHeaders.append("Vary", "Cookie");

		return new Response(transformedResponse.body, {
			status: transformedResponse.status,
			statusText: transformedResponse.statusText,
			headers: responseHeaders,
		});
	},
};
