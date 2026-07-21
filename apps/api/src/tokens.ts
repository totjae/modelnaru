export const MODELNARU_CONFIG = Symbol('MODELNARU_CONFIG');
export const DATABASE_HEALTH = Symbol('DATABASE_HEALTH');

export interface DatabaseHealth {
  ping(): Promise<void>;
}
