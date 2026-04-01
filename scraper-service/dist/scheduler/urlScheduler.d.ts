import type { UrlSchedule, CreateScheduleInput, UpdateScheduleInput, ScheduleRun } from "../types";
export declare function initUrlScheduler(): Promise<void>;
export declare function shutdownUrlScheduler(): void;
export declare function listSchedules(): Promise<UrlSchedule[]>;
export declare function getSchedule(id: string): Promise<UrlSchedule | undefined>;
export declare function createSchedule(input: CreateScheduleInput): Promise<UrlSchedule>;
export declare function updateSchedule(id: string, patch: UpdateScheduleInput): Promise<UrlSchedule | null>;
export declare function deleteSchedule(id: string): Promise<boolean>;
export declare function pauseSchedule(id: string): Promise<UrlSchedule | null>;
export declare function resumeSchedule(id: string): Promise<UrlSchedule | null>;
/** Run a single schedule immediately (manual trigger). */
export declare function runScheduleNow(id: string): Promise<void>;
/**
 * Run all members of a schedule's group sequentially.
 * If the schedule is not part of a group, runs it individually.
 */
export declare function runGroupNow(scheduleId: string): Promise<void>;
export declare function clearRuns(): Promise<void>;
export declare function listRuns(scheduleId?: string): Promise<ScheduleRun[]>;
