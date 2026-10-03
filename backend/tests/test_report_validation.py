import pytest
from pydantic import ValidationError

from app.schemas import ReportScheduleUpdate, SendReportRequest


@pytest.mark.parametrize("change", [
    {"time": ""}, {"time": "25:00"}, {"time": "09:80"},
    {"cadence": "monthly"}, {"day_of_week": 7},
    {"enabled": True, "email": ""}, {"email": "invalid"},
    {"enabled": True, "cadence": "weekly", "day_of_week": None, "email": "a@example.com"},
])
def test_invalid_schedule_rejected_before_persistence(change):
    with pytest.raises(ValidationError):
        ReportScheduleUpdate(**({"enabled": False, "cadence": "daily", "time": "09:00", "email": None} | change))


def test_disabled_schedule_and_trimmed_recipient():
    assert ReportScheduleUpdate(enabled=False, cadence="daily", time="09:00", email=None).email is None
    assert SendReportRequest(email=" a@example.com ").email == "a@example.com"
    with pytest.raises(ValidationError):
        SendReportRequest(email="bad\r\naddress@example.com")
