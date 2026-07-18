from __future__ import annotations

from email.message import EmailMessage
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import get_settings

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_user and s.smtp_password)


def render_report_html(report: dict) -> str:
    template = _env.get_template("report.html.j2")
    return template.render(report=report)


async def send_report_email(to_email: str, report: dict) -> None:
    """Render + send the report. Raises RuntimeError if SMTP isn't configured, or
    propagates aiosmtplib errors on send failure."""
    s = get_settings()
    if not smtp_configured():
        raise RuntimeError("SMTP is not configured — set SMTP_* values in backend/.env.")

    html = render_report_html(report)
    repo_count = len(report.get("repos", []))

    message = EmailMessage()
    message["From"] = s.smtp_from or s.smtp_user
    message["To"] = to_email
    message["Subject"] = f"Informer report — {repo_count} repo{'s' if repo_count != 1 else ''}"
    message.set_content("Your Informer report is best viewed in an HTML email client.")
    message.add_alternative(html, subtype="html")

    use_ssl = s.smtp_port == 465
    await aiosmtplib.send(
        message,
        hostname=s.smtp_host,
        port=s.smtp_port,
        username=s.smtp_user,
        password=s.smtp_password,
        start_tls=not use_ssl,
        use_tls=use_ssl,
    )
