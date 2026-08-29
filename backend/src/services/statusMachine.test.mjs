import assert from 'node:assert';
import { assertTransition, RuleError } from './statusMachine.js';

const past = { status: 'CONFIRMED', startsAt: new Date('2020-01-01') };
const future = { status: 'CONFIRMED', startsAt: new Date('2099-01-01') };

function throws(fn, match) {
  assert.throws(fn, (e) => e instanceof RuleError && e.message.includes(match));
}

assertTransition({ status: 'REQUESTED' }, 'CONFIRMED');
assertTransition(past, 'NO_SHOW');
assertTransition({ status: 'REQUESTED' }, 'CANCELLED', { reason: 'patient called' });

throws(() => assertTransition({ status: 'REQUESTED' }, 'COMPLETED'), 'Cannot move');
throws(() => assertTransition(future, 'NO_SHOW'), 'scheduled time');
throws(() => assertTransition({ status: 'CHECKED_IN' }, 'CANCELLED', { reason: 'x' }), 'checked in');
throws(() => assertTransition({ status: 'CONFIRMED' }, 'CANCELLED'), 'requires a reason');
throws(() => assertTransition({ status: 'COMPLETED' }, 'CHECKED_IN'), 'final state');

console.log('status machine: all assertions passed');