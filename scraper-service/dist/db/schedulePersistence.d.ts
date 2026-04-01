import type { UrlSchedule, ScheduleRun } from "../types";
export declare function readSchedules(): Promise<UrlSchedule[]>;
export declare function writeSchedules(schedules: UrlSchedule[]): Promise<void>;
export declare function insertSchedule(schedule: UrlSchedule): Promise<void>;
export declare function patchSchedule(id: string, patch: Record<string, unknown>): Promise<void>;
export declare function removeSchedule(id: string): Promise<boolean>;
export declare function getScheduleById(id: string): Promise<UrlSchedule | undefined>;
export declare function readRuns(scheduleId?: string): Promise<ScheduleRun[]>;
export declare function insertRun(run: ScheduleRun): Promise<void>;
export declare function patchRun(runId: string, patch: Partial<ScheduleRun>): Promise<void>;
export declare function clearAllRuns(): Promise<void>;
/** Returns true if Supabase is being used for persistence. */
export declare function isUsingSupabase(): boolean;
