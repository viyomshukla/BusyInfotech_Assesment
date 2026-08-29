import Appointment from '../models/Appointment.js';
import { startOfDay, addDays, startOfWeek, subWeeks } from 'date-fns';

export async function getDashboard(actor, { now = new Date() } = {}) {
  const scope = { archivedAt: null };
  if (actor.role === 'PROVIDER') {
    scope.$or = [{ providerId: actor._id }, { 'careTeam.providerId': actor._id }];
  }

  const todayStart = startOfDay(now);
  const todayEnd = addDays(todayStart, 1);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const eightWeeksAgo = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7);

  const [facet] = await Appointment.aggregate([
    { $match: scope },
    {
      $facet: {
        today: [
          { $match: { startsAt: { $gte: todayStart, $lt: todayEnd } } },
          { $count: 'n' },
        ],
        checkedIn: [{ $match: { status: 'CHECKED_IN' } }, { $count: 'n' }],
        noShowsThisWeek: [
          { $match: { status: 'NO_SHOW', startsAt: { $gte: weekStart } } },
          { $count: 'n' },
        ],
        upcomingConfirmed: [
          { $match: { status: 'CONFIRMED', startsAt: { $gte: now } } },
          { $count: 'n' },
        ],
        byProvider: [
          { $group: { _id: '$providerName', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        noShowTrend: [
          {
            $match: {
              startsAt: { $gte: eightWeeksAgo, $lt: now },
              status: { $in: ['NO_SHOW', 'COMPLETED', 'CHECKED_IN', 'CONFIRMED'] },
            },
          },
          {
            $group: {
              _id: { $dateTrunc: { date: '$startsAt', unit: 'week', startOfWeek: 'monday' } },
              total: { $sum: 1 },
              noShows: { $sum: { $cond: [{ $eq: ['$status', 'NO_SHOW'] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const first = (arr) => arr[0]?.n ?? 0;

  return {
    headline: {
      appointmentsToday: first(facet.today),
      checkedInNow: first(facet.checkedIn),
      noShowsThisWeek: first(facet.noShowsThisWeek),
      upcomingConfirmed: first(facet.upcomingConfirmed),
    },
    byProvider: facet.byProvider.map((r) => ({ provider: r._id, count: r.count })),
    byStatus: facet.byStatus.map((r) => ({ status: r._id, count: r.count })),
    noShowTrend: facet.noShowTrend.map((r) => ({
      weekStarting: r._id,
      total: r.total,
      noShows: r.noShows,
      rate: r.total ? Number(((r.noShows / r.total) * 100).toFixed(1)) : 0,
    })),
  };
}