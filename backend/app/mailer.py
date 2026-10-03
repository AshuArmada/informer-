from __future__ import annotations

import datetime as dt
from email.message import EmailMessage
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import get_settings


def _pretty_date(iso: str) -> str:
    """'2026-07-30T14:20:05+00:00' -> 'Thursday, 30 July 2026 · 14:20 UTC'."""
    try:
        moment = dt.datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return iso
    # %-d / %-I aren't portable (they fail on Windows), so build the day by hand.
    return f"{moment:%A}, {moment.day} {moment:%B %Y} · {moment:%H:%M} UTC"


_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)
_env.filters["pretty_date"] = _pretty_date


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_user and s.smtp_password)


def render_report_html(report: dict) -> str:
    template = _env.get_template("report.html.j2")
    return template.render(report=report)


def render_report_text(report: dict) -> str:
    """Plain-text alternative — clients that refuse HTML still get the whole report."""
    repos = report.get("repos", [])
    total_issues = sum(r["open_issue_count"] for r in repos)
    total_open_prs = sum(r["pr_counts"]["open"] for r in repos)

    lines = [
        "INFORMER — REPOSITORY REPORT",
        _pretty_date(report.get("generated_at", "")),
        "",
        f"{len(repos)} repo{'' if len(repos) == 1 else 's'} · "
        f"{total_issues} open issue{'' if total_issues == 1 else 's'} · "
        f"{total_open_prs} open PR{'' if total_open_prs == 1 else 's'}",
    ]

    for repo in repos:
        lines += ["", "-" * 56, repo["full_name"], repo["html_url"]]
        if repo.get("error"):
            lines.append(f"  ! {repo['error']}")
            continue

        prs = repo["pr_counts"]
        lines.append(
            f"  {repo['open_issue_count']} open issues · "
            f"PRs: {prs['open']} open / {prs['merged']} merged / {prs['closed']} closed"
        )
        if not repo["groups"]:
            lines.append("  No open issues.")
        for group in repo["groups"]:
            lines.append("")
            lines.append(f"  {group['assignee'] or 'Unassigned'} ({group['count']})")
            for issue in group["issues"][:6]:
                lines.append(f"    #{issue['number']} {issue['title']}")
            if group["count"] > 6:
                lines.append(f"    + {group['count'] - 6} more")

    lines += ["", "-" * 56, "Sent by Informer"]
    return "\n".join(lines)


async def send_report_email(to_email: str, report: dict) -> None:
    """Render + send the report. Raises RuntimeError if SMTP isn't configured, or
    propagates aiosmtplib errors on send failure."""
    s = get_settings()
    if not smtp_configured():
        raise RuntimeError("SMTP is not configured — set SMTP_* values in backend/.env.")

    html = render_report_html(report)
    repos = report.get("repos", [])
    repo_count = len(repos)
    issue_count = sum(r["open_issue_count"] for r in repos)

    message = EmailMessage()
    message["From"] = s.smtp_from or s.smtp_user
    message["To"] = to_email
    message["Subject"] = (
        f"Informer — {repo_count} repo{'' if repo_count == 1 else 's'}, "
        f"{issue_count} open issue{'' if issue_count == 1 else 's'}"
    )
    message.set_content(render_report_text(report))
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
