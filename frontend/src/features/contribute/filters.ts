export interface RepositoryFiltersValue {
  topic: string
  license: string
  min_stars: number
  activity_days: number
  issue_label: string
  unassigned: boolean
}

export const defaultFilters: RepositoryFiltersValue = {
  topic: '', license: '', min_stars: 0, activity_days: 90, issue_label: '', unassigned: false,
}
