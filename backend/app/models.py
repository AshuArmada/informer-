from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AppSettings(Base):
    """Single-row table holding app-wide settings, currently just the GitHub PAT."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_login: Mapped[str | None] = mapped_column(String(255), nullable=True)
    token_updated_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Snapshot(Base):
    """One polling snapshot of a repo's star count, used to compute trending velocity."""

    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    repo_full_name: Mapped[str] = mapped_column(String(255), index=True)
    stars: Mapped[int] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(100), nullable=True)
    html_url: Mapped[str] = mapped_column(String(500))
    captured_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class SavedRepo(Base):
    """A repo bookmarked from the trending feed. Saved repos are excluded from trending."""

    __tablename__ = "saved_repos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    repo_full_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(100), nullable=True)
    html_url: Mapped[str] = mapped_column(String(500))
    stars: Mapped[int] = mapped_column(Integer, default=0)
    saved_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TrackedRepo(Base):
    __tablename__ = "tracked_repos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    added_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReportSchedule(Base):
    """Single-row table for the recurring report digest configuration."""

    __tablename__ = "report_schedule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cadence: Mapped[str] = mapped_column(String(20), default="daily")  # "daily" | "weekly"
    time: Mapped[str] = mapped_column(String(5), default="09:00")  # "HH:MM", 24h
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0=Mon..6=Sun, weekly only
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)


class ReportLog(Base):
    """Audit trail confirming on-demand/scheduled report emails actually sent."""

    __tablename__ = "report_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sent_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    email: Mapped[str] = mapped_column(String(255))
    repo_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))  # "sent" | "failed"
