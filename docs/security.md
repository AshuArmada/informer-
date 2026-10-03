# Local application security

Informer is a single-user application for a trusted computer, not a public service.
There is no account system, multi-user authorization, or protection against a
malicious process running as your OS user. Do not publish its ports through a tunnel
or a reverse proxy. Public hosting requires a separate authentication/authorization
design, HTTPS, session management, shared rate limiting, and a deployment review.

## Protections

- The API checks both the connecting IP and Host header. Only loopback clients and
  `localhost`, `127.0.0.1`, or `::1` hosts are accepted, reducing DNS rebinding risk.
  Keep Uvicorn bound to loopback and do not trust forwarded client headers from a
  public proxy. Vite also binds to loopback. Docker's database and Adminer ports
  are bound to `127.0.0.1`; existing containers need `docker compose up -d` to apply.
- Browser origins use an explicit allowlist. Defaults cover localhost and
  127.0.0.1 on development port 5173 and preview port 4173. If overriding
  `CORS_ORIGINS`, include the exact UI origins in JSON. No wildcard origins or
  credentialed CORS are needed.
- Mutations require `Content-Type: application/json` and `X-Informer-Request: 1`.
  Together with the origin allowlist, this blocks cross-origin form submissions
  and unapproved browser preflights. Local scripts must send both headers too.
- Request bodies are capped at 64 KiB even without Content-Length. Idle request
  body reads time out after 10 seconds. Per-process, shared rolling limits allow
  120 reads, 30 changes, and 6 AI advice requests per minute, with HTTP 429 and
  Retry-After on exhaustion. These are local resource limits, not account quotas.
- API responses use no-store, nosniff, frame denial, no-referrer, and a restrictive
  CSP. Vite development and preview responses have a frontend CSP and security
  headers. Development permits inline bootstrap scripts for Vite; preview permits
  only same-origin scripts. A different static server must set equivalent headers.
- GitHub tokens and UI provider overrides are encrypted with Fernet using the
  installation's SECRET_KEY. APIs return only status/configuration and a masked
  GitHub hint. API validation responses omit submitted inputs. Key fields use
  password controls, are cleared after saving, and are not put in browser storage.
  Environment defaults still live in `.env`; protect that file and database backups
  with OS file permissions. Loss of SECRET_KEY makes encrypted values unrecoverable.
- Cloud provider and GitHub destinations are fixed HTTPS endpoints. Browser-supplied
  Ollama URLs are restricted to literal loopback IPs on HTTP port 11434, without
  credentials, paths, queries, or fragments. This avoids user-controlled DNS and
  arbitrary internal-service requests. Backend environment defaults are trusted
  operator configuration. Connection checks do not follow redirects or use HTTP
  proxy environment variables, and return generic upstream errors without bodies.
- Repository/filter inputs are bounded and validated. Saved repository URLs are
  rebuilt as HTTPS GitHub links, preventing persisted javascript: URLs. Repository
  and AI text is rendered as text, not injected HTML. AI prompts identify repository
  content as untrusted; AI has no tools or ability to change a repository.
- Credential changes/removals, provider resets, and rejected requests are logged
  through `informer.security`, without keys, request bodies, or query strings.
  This is a local application log, not a tamper-proof audit service.

## Provider controls

Settings → AI connections manages models, default provider, timeout, API keys,
and local Ollama address. Saving takes effect on new requests without a restart.
Blank key inputs preserve existing keys; **Remove key and disable provider** saves
an empty override so a key in `.env` cannot silently reactivate that provider.
**Restore installation defaults** deletes all UI overrides and explicitly restores
the environment defaults. A connection test reads the provider's model listing;
it does not generate content, verify model access, or guarantee generation quota.

The GitHub token can be removed independently. Use the narrowest read permissions
needed. Public discovery does not need a classic token with the broad `repo` scope;
private reports need access to the selected private repositories.

SMTP remains installation configuration in `.env`. AI requests send only the selected
provider your skills and public evidence. Configuring a loopback Ollama server does
not establish that the selected model itself runs locally; install a local model.

## Verification and references

From `backend`, run `./.venv/Scripts/python -m pytest`. Tests cover host/origin checks, protected changes,
body limits, rate limits, input redaction, encrypted updates, key removal, endpoint
validation, redirect refusal, and provider failure handling. Provider HTTP calls are
mocked to avoid using real keys or incurring generation costs.

Design references: [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
and [GitHub repository search qualifiers](https://github.com/github/docs/blob/main/content/search-github/searching-on-github/searching-for-repositories.md).
