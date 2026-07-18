from app.report_generator import _group_issues_by_assignee, _pr_counts


def _issue(number, assignees):
    return {
        "number": number,
        "title": f"Issue {number}",
        "html_url": f"https://example/{number}",
        "assignees": [{"login": a, "avatar_url": None} for a in assignees],
    }


def test_groups_sorted_by_count_with_unassigned_last():
    issues = [
        _issue(1, ["alice"]),
        _issue(2, ["alice", "bob"]),
        _issue(3, []),
    ]
    groups = _group_issues_by_assignee(issues)

    assert [g["assignee"] for g in groups] == ["alice", "bob", None]
    assert groups[0]["count"] == 2  # alice has issues 1 and 2
    assert groups[-1]["assignee"] is None and groups[-1]["count"] == 1


def test_multi_assignee_issue_appears_under_each():
    groups = _group_issues_by_assignee([_issue(7, ["alice", "bob"])])
    by_login = {g["assignee"]: g for g in groups}
    assert 7 in [i["number"] for i in by_login["alice"]["issues"]]
    assert 7 in [i["number"] for i in by_login["bob"]["issues"]]


def test_pr_counts_split_open_merged_closed():
    prs = [
        {"state": "open", "merged_at": None},
        {"state": "open", "merged_at": None},
        {"state": "closed", "merged_at": "2026-01-01T00:00:00Z"},  # merged
        {"state": "closed", "merged_at": None},  # closed unmerged
    ]
    assert _pr_counts(prs) == {"open": 2, "merged": 1, "closed": 1}


def test_empty_issues_yields_no_groups():
    assert _group_issues_by_assignee([]) == []
