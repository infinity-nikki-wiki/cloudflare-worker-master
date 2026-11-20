import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src";

const VECTOR_HTML = `<!DOCTYPE html>
<html class="client-nojs skin-theme-clientpref-thumb-standard" lang="en" dir="ltr">
<head><title>The Infinity Nikki Wiki</title></head>
<body class="skin-vector-legacy">
  <nav id="p-personal">
    <div class="vector-menu-content">
      <ul class="vector-menu-content-list">
        <li id="pt-theme-toggle"><a href="#" class="is-dark"></a></li>
        <li id="pt-login"><a href="/Special:UserLogin">Log in</a></li>
      </ul>
    </div>
  </nav>
</body>
</html>`;

const MINERVA_HTML = `<!DOCTYPE html>
<html class="client-nojs skin-theme-clientpref-thumb-standard" lang="en" dir="ltr">
<head><title>The Infinity Nikki Wiki</title></head>
<body class="skin-minerva">
  <ul class="toggle-list__list new minerva-user-menu-list" id="p-personal">
    <li id="pt-login"><a href="/Special:UserLogin">Log in</a></li>
  </ul>
</body>
</html>`;

afterEach(() => {
	vi.restoreAllMocks();
});

function mockUpstreamHtml(html, headers = { "Content-Type": "text/html; charset=utf-8" }) {
	return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html, { status: 200, headers }));
}

describe("theme-worker", () => {
	it("defaults to light mode when no cookie is set", async () => {
		const fetchSpy = mockUpstreamHtml(VECTOR_HTML);

		const request = new Request("http://localhost:8787/Main_Page");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0][0].url).toBe("https://infinitynikki.wiki/Main_Page");

		const body = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
		expect(response.headers.get("Vary")).toContain("Cookie");

		expect(body).toContain('data-theme="day"');
		expect(body).toContain('data-mode="light"');
		expect(body).not.toContain("data-mode-pref");
		expect(body).toContain("var DEFAULT_MODE = 'light'");
		expect(body).toContain("Switch to dark theme");
		expect(body.match(/id="pt-theme-toggle"/g)).toHaveLength(1);
		expect(body).not.toContain("matchMedia");
		expect(body).not.toContain("pt-fixedwidth-toggle");
		expect(body).not.toContain("usericon");
	});

	it("supports mode=dark cookie", async () => {
		mockUpstreamHtml(VECTOR_HTML);

		const request = new Request("http://localhost:8787/Main_Page", {
			headers: { Cookie: "mode=dark; theme=night" },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toContain('data-theme="night"');
		expect(body).toContain('data-mode="dark"');
		expect(body).toContain("Switch to light theme");
	});

	it("falls back to light mode on mode=auto or invalid cookies", async () => {
		mockUpstreamHtml(VECTOR_HTML);

		const request = new Request("http://localhost:8787/Main_Page", {
			headers: { Cookie: 'mode=auto; theme="../bad"' },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).toContain('data-theme="day"');
		expect(body).toContain('data-mode="light"');
		expect(body).toContain("Switch to dark theme");
	});

	it("does not inject #pt-theme-toggle into Minerva #p-personal ul", async () => {
		mockUpstreamHtml(MINERVA_HTML);

		const request = new Request("http://localhost:8787/Main_Page?useskin=minerva");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		const body = await response.text();
		expect(body).not.toContain('id="pt-theme-toggle"');
		expect(body).toContain("isMinerva()");
	});

	it("passes non-HTML responses through untouched", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("body { color: red; }", {
				status: 200,
				headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300" },
			})
		);

		const request = new Request("http://localhost:8787/load.php?modules=site");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(await response.text()).toBe("body { color: red; }");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
		expect(response.headers.get("Vary")).toBeNull();
	});

	it("bypasses edge caching when session cookie is present", async () => {
		const fetchSpy = mockUpstreamHtml(VECTOR_HTML);

		const request = new Request("http://localhost:8787/Main_Page", {
			headers: { Cookie: "wiki_session=abc123; mode=dark" },
		});
		const ctx = createExecutionContext();
		await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchSpy.mock.calls[0][1]).toEqual({
			cf: {
				cacheEverything: false,
				cacheTtl: -1,
			},
		});
	});
});
