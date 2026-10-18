/**
 * Strict Payment Lifecycle State Machine.
 * Validates allowable state transitions and prevents illegal status jumps.
 */

const VALID_TRANSITIONS = {
  CREATED: ['QUEUED', 'ACTIVE', 'CANCELLED', 'EXPIRED'],
  QUEUED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['PAYING', 'VERIFYING', 'SUCCESS', 'CANCELLED', 'EXPIRED', 'FAILED'],
  PAYING: ['VERIFYING', 'SUCCESS', 'CANCELLED', 'EXPIRED', 'FAILED', 'SUSPICIOUS'],
  VERIFYING: ['SUCCESS', 'FAILED', 'EXPIRED', 'SUSPICIOUS'],
  SUCCESS: [], // Terminal
  FAILED: [],  // Terminal
  EXPIRED: [], // Terminal
  CANCELLED: [], // Terminal
  SUSPICIOUS: ['SUCCESS', 'FAILED'] // Manual admin resolution
};

export class PaymentStateMachine {
  /**
   * Check if transitioning from current to next state is permitted.
   * @param {string} fromState
   * @param {string} toState
   * @returns {boolean}
   */
  static canTransition(fromState, toState) {
    if (fromState === toState) return true;
    const allowed = VALID_TRANSITIONS[fromState];
    return allowed ? allowed.includes(toState) : false;
  }

  /**
   * Assert transition is valid or throw.
   * @param {string} fromState
   * @param {string} toState
   */
  static assertTransition(fromState, toState) {
    if (!this.canTransition(fromState, toState)) {
      throw new Error(`Illegal payment state transition from ${fromState} to ${toState}`);
    }
  }

  /**
   * Checks if a state is final/terminal.
   * @param {string} state
   * @returns {boolean}
   */
  static isTerminal(state) {
    return ['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(state);
  }
}
