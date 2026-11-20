const DEFAULT_THEME = "day";
const DEFAULT_MODE = "light";
const VALID_MODES = ["light", "dark"];

const TOKEN_PATTERN = /^[a-z0-9-]+$/;

const MODE_LABELS = {
  light: "Switch to dark theme",
  dark: "Switch to light theme",
};

const BOOTSTRAP_SCRIPT = `
      <script>
        (function () {
          var root = document.documentElement;
          var DEFAULT_THEME = '${DEFAULT_THEME}';
          var DEFAULT_MODE = '${DEFAULT_MODE}';
          var TOKEN_RE = /^[a-z0-9-]+$/;
          var MODE_LABELS = ${JSON.stringify(MODE_LABELS)};

          function isMinerva() {
            return !!(
              (document.body && document.body.classList.contains('skin-minerva')) ||
              root.classList.contains('skin-theme-clientpref-day') ||
              root.classList.contains('skin-theme-clientpref-night') ||
              root.classList.contains('skin-theme-clientpref-os')
            );
          }

          function getCookie(name) {
            var match = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + name + '=([^;]+)'));
            if (!match) return null;
            try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
          }

          function setCookie(name, value) {
            var secure = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=31536000; SameSite=Lax' + secure;
          }

          function syncLabels() {
            var mode = root.getAttribute('data-mode') === 'dark' ? 'dark' : DEFAULT_MODE;
            var themeLink = document.querySelector('#pt-theme-toggle a');
            if (themeLink) {
              var themeLabel = MODE_LABELS[mode] || MODE_LABELS[DEFAULT_MODE];
              themeLink.setAttribute('aria-label', themeLabel);
              themeLink.setAttribute('title', themeLabel);
            }
          }

          function syncFromCookies() {
            if (isMinerva()) return;

            var rawTheme = getCookie('theme');
            var theme = rawTheme && TOKEN_RE.test(rawTheme) ? rawTheme : DEFAULT_THEME;

            var rawMode = getCookie('mode');
            var mode = rawMode === 'dark' || rawMode === 'light' ? rawMode : DEFAULT_MODE;

            root.setAttribute('data-theme', theme);
            root.setAttribute('data-mode', mode);
            syncLabels();
          }

          syncFromCookies();

          window.addEventListener('pageshow', function (event) {
            if (event.persisted && !isMinerva()) syncFromCookies();
          });

          document.addEventListener('DOMContentLoaded', function () {
            if (!isMinerva()) syncLabels();
          });

          document.addEventListener('click', function (event) {
            var el = event.target && event.target.closest ? event.target.closest('#pt-theme-toggle a') : null;
            if (!el) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();

            var cur = root.getAttribute('data-mode') === 'dark' ? 'dark' : DEFAULT_MODE;
            var next = cur === 'dark' ? 'light' : 'dark';
            setCookie('mode', next);
            syncFromCookies();
          }, true);
        })();
      </script>
    `;

const CRITICAL_CSS = `
      <style>
        :root[data-mode="dark"] {
          color-scheme: dark;
        }
        :root[data-mode="light"] {
          color-scheme: light;
        }

        /* Keep toggle aligned inside Vector personal menu */
        #pt-theme-toggle {
          display: inline-block;
          vertical-align: middle;
        }

        /* Theme Toggle Styling */
        #pt-theme-toggle a {
          width: 16px;
          height: 16px;
          display: block;
          opacity: 0.6;
          background-color: var(--color-base, #80662D);
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }
        #pt-theme-toggle a:hover {
          opacity: 1;
        }

        :root[data-mode="light"] #pt-theme-toggle a,
        #pt-theme-toggle a.is-light {
          --pt-theme-icon: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill-rule="evenodd"><path d="M17.07 7.07V2.93h-4.14L10 0 7.07 2.93H2.93v4.14L0 10l2.93 2.93v4.14h4.14L10 20l2.93-2.93h4.14v-4.14L20 10zM10 16a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"/><circle cx="10" cy="10" r="4.5"/></svg>');
          -webkit-mask-image: var(--pt-theme-icon);
          mask-image: var(--pt-theme-icon);
        }
        :root[data-mode="dark"] #pt-theme-toggle a,
        #pt-theme-toggle a.is-dark {
          --pt-theme-icon: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586z"/></svg>');
          -webkit-mask-image: var(--pt-theme-icon);
          mask-image: var(--pt-theme-icon);
        }
      </style>
    `;

function parseCookies(cookieHeader) {
  const out = Object.create(null);
  if (typeof cookieHeader !== "string" || !cookieHeader) return out;

  for (const part of cookieHeader.split(";")) {
    const s = part.trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    if (eq === -1) continue;
    const name = s.slice(0, eq).trim();
    const value = s.slice(eq + 1).trim();
    if (!name) continue;

    const unquoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    out[name] = safeDecodeURIComponent(unquoted);
  }
  return out;
}

function sanitizeToken(value, pattern = TOKEN_PATTERN) {
  if (typeof value !== "string" || !value || !pattern.test(value)) return null;
  return value;
}

function safeDecodeURIComponent(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function resolveTheme(rawTheme) { return sanitizeToken(rawTheme) || DEFAULT_THEME; }
function resolveMode(rawMode) {
  const mode = sanitizeToken(rawMode);
  return VALID_MODES.includes(mode) ? mode : DEFAULT_MODE;
}

export function applyThemeRewriter(rewriter, request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = parseCookies(cookieHeader);

  const theme = resolveTheme(cookies.theme);
  const mode = resolveMode(cookies.mode);
  const themeLabel = MODE_LABELS[mode];

  rewriter
      .on("html", {
        element(el) {
          el.setAttribute("data-theme", theme);
          el.setAttribute("data-mode", mode);
        },
      })
      .on("head", {
        element(el) {
          el.prepend(BOOTSTRAP_SCRIPT + CRITICAL_CSS, { html: true });
        },
      })
      .on("#pt-theme-toggle", {
        element(el) {
          el.remove();
        },
      })
      .on("#p-personal ul", {
        element(el) {
          const themeToggleHtml = `<li id="pt-theme-toggle"><a href="#" aria-label="${themeLabel}" title="${themeLabel}"></a></li>`;
          el.prepend(themeToggleHtml, { html: true });
        },
      });

  return rewriter;
}
