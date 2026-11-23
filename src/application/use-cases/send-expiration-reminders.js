/** HU-25: emite report.expiring-soon para los reportes que expiran en los próximos `reminderDays` días. */
export class SendExpirationReminders {
  constructor({ reports, events, policy, reminderDays }) {
    this.reports = reports
    this.events = events
    this.policy = policy
    this.reminderDays = reminderDays
  }

  async execute(now = new Date()) {
    const ahead = new Date(now.getTime() + this.reminderDays * 86_400_000)
    const expiringSoon = await this.reports.findActiveByLastActivity({
      after: this.policy.inactiveSince(now),
      before: this.policy.inactiveSince(ahead),
    })

    let sent = 0
    for (const report of expiringSoon) {
      if (!report.remindExpiration(this.policy.expiresAt(report.lastActivityDate), now)) continue
      await this.reports.save(report)
      await this.events.publish(report.pullEvents())
      sent++
    }
    return sent
  }
}
