export type Platform = "Facebook" | "LinkedIn" | "Reddit" | "X";

export type IntentLevel = "High" | "Medium" | "Low";

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Dismissed";

export type IntentCategory =
  | "Direct Hiring"
  | "Recommendation Request"
  | "Budget Inquiry"
  | "Delegation Signal"
  | "Technical VA Request";

export interface Lead {
  id: string;
  platform: Platform;
  source: string;
  username: string;
  text: string;
  url: string;
  intentScore: number;
  intentLevel: IntentLevel;
  intentCategory: IntentCategory;
  status: LeadStatus;
  engagement: number;
  location?: string;
  matchedKeywords: string[];
  createdAt: Date;
  assignedTo?: string;
}

export interface Alert {
  id: string;
  leadId: string;
  platform: Platform;
  intentScore: number;
  snippet: string;
  username: string;
  source: string;
  createdAt: Date;
  read: boolean;
}

export interface DailyReport {
  date: string;
  totalLeads: number;
  highIntent: number;
  mediumIntent: number;
  lowIntent: number;
  platforms: Record<Platform, number>;
  topLeads: Lead[];
}

export interface PlatformConfig {
  platform: Platform;
  enabled: boolean;
  postsPerMinute: number;
  lastActive?: Date;
  totalDetected: number;
}

export interface DashboardStats {
  totalLeads: number;
  highIntentLeads: number;
  avgIntentScore: number;
  responseRate: number;
  totalLeadsChange: number;
  highIntentChange: number;
  avgScoreChange: number;
  responseRateChange: number;
}

export interface ChartDataPoint {
  date: string;
  leads: number;
  highIntent: number;
}
