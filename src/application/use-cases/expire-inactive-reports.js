/** HU-16: pasa a EXPIRED los reportes activos que superaron los días sin actividad. */
export class ExpireInactiveReports {
  constructor({ reports, events, policy }) {
    this.reports = reports
    this.events = events
    this.policy = policy
  }

  async execute(now = new Date()) {
    const inactive = await this.reports.findActiveByLastActivity({ before: this.policy.inactiveSince(now) })
    for (const report of inactive) {
      report.expire(now)
      await this.reports.save(report)
      await this.events.publish(report.pullEvents())
    }
    return inactive.length
  }
}
