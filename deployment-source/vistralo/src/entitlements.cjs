'use strict';
// Plan limits the worker checks for itself. The app and the database check too, but a job that
// reached the queue some other way, or outlived a downgrade, still stops here before paid work.

// Only AI walkthroughs and website analyses count towards a plan's monthly allowance.
const COUNTED = new Set(['website', 'narrate']);

/**
 * Reads the owner's plan through public.vistralo_worker_entitlement.
 * Returns null when billing is not installed (PGRST202) or limits are switched off, so a
 * workspace without the billing migration behaves exactly as it did before.
 */
async function loadEntitlement(db, owner) {
  const result = await db.rpc('vistralo_worker_entitlement', { target: owner });
  if (result.error) {
    if (result.error.code === 'PGRST202') return null;
    throw Error(`Could not read the owner's plan: ${result.error.message}`);
  }
  return result.data && result.data.enforce ? result.data : null;
}

const where = 'Choose a larger plan in Settings, under Billing.';

/** The job being checked was already counted when it was queued, so only going over is a refusal. */
function checkQuota(entitlement, job) {
  if (!entitlement || !COUNTED.has(job.kind)) return;
  const cap = entitlement.monthlyJobs;
  if (cap === null || cap === undefined) return;
  if (Number(entitlement.jobsUsed) > cap)
    throw Error(`This month's ${cap} AI walkthroughs on the ${entitlement.planName} plan are used. ${where}`);
}

function checkDuration(entitlement, seconds) {
  if (!entitlement) return;
  const cap = entitlement.maxSourceMinutes;
  if (cap === null || cap === undefined || !(seconds > cap * 60)) return;
  const minutes = Math.ceil(seconds / 60);
  throw Error(`This recording is ${minutes} minutes long, and the ${entitlement.planName} plan narrates up to ${cap}. Trim it, or ${where.charAt(0).toLowerCase()}${where.slice(1)}`);
}

module.exports = { COUNTED, loadEntitlement, checkQuota, checkDuration };
