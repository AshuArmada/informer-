from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.db import async_session_factory
from app.mailer import send_report_email
from app.models import ReportLog, ReportSchedule
from app.report_generator import generate_report

logger = logging.getLogger("informer.scheduler")

_scheduler = AsyncIOScheduler()
JOB_ID = "scheduled_report"


async def get_or_create_schedule(db) -> ReportSchedule:
    result = await db.execute(select(ReportSchedule).limit(1))
    row = result.scalar_one_or_none()
    if row is None:
        row = ReportSchedule()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _run_scheduled_report() -> None:
    async with async_session_factory() as db:
        schedule = await get_or_create_schedule(db)
        if not schedule.enabled or not schedule.email:
            return

        email = schedule.email
        status = "sent"
        repo_count = 0
        try:
            report = await generate_report(db)
            repo_count = len(report["repos"])
            await send_report_email(email, report)
        except Exception:
            logger.exception("Scheduled report send failed")
            status = "failed"

        db.add(ReportLog(email=email, repo_count=repo_count, status=status))
        await db.commit()


def _trigger_for(schedule: ReportSchedule) -> CronTrigger:
    hour, minute = (int(x) for x in schedule.time.split(":"))
    if schedule.cadence == "weekly":
        return CronTrigger(day_of_week=schedule.day_of_week or 0, hour=hour, minute=minute)
    return CronTrigger(hour=hour, minute=minute)


def reschedule(schedule: ReportSchedule) -> None:
    """(Re)configure the report job from the current schedule row. Called on startup
    and whenever the schedule is updated via the API."""
    if _scheduler.get_job(JOB_ID):
        _scheduler.remove_job(JOB_ID)
    if schedule.enabled and schedule.email:
        _scheduler.add_job(
            _run_scheduled_report,
            trigger=_trigger_for(schedule),
            id=JOB_ID,
            replace_existing=True,
        )
        logger.info("Report schedule active: %s at %s", schedule.cadence, schedule.time)
    else:
        logger.info("Report schedule inactive")


async def start_scheduler() -> None:
    _scheduler.start()
    async with async_session_factory() as db:
        schedule = await get_or_create_schedule(db)
    reschedule(schedule)


async def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
