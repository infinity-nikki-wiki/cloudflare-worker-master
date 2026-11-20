import { applyThemeRewriter } from "./theme-cookies.js";

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

		let originResponse;
		try {
			originResponse = await fetch(finalRequest);
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
