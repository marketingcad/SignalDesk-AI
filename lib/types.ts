export type Platform = "Facebook" | "LinkedIn" | "Reddit" | "X" | "Other";

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

// ---------------------------------------------------------------------------
// Facebook Webhook
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AI Lead Qualification
// ---------------------------------------------------------------------------

export type AIIntentCategory =
  | "HIGH_INTENT"
  | "MEDIUM_INTENT"
  | "LOW_INTENT"
  | "NOT_RELATED";

export type AIUrgency = "HIGH" | "MEDIUM" | "LOW";

export type AIBudgetEstimate =
  | "hourly_low"
  | "hourly_mid"
  | "hourly_high"
  | "monthly_contract"
  | "unknown";

export type AISpamRisk = "SAFE" | "SUSPICIOUS" | "LIKELY_SCAM";

export interface AIQualificationResult {
  isHiring: boolean | "uncertain";
  intentCategory: AIIntentCategory;
  leadScore: number;
  urgency: AIUrgency;
  tasks: string[];
  skills: string[];
  tools: string[];
  industry: string;
  location: string;
  budgetEstimate: AIBudgetEstimate;
  spamRisk: AISpamRisk;
  spamReason: string;
  leadSummary: string;
}

// ---------------------------------------------------------------------------
// Facebook Webhook
// ---------------------------------------------------------------------------

export type PostClassification = "HIRING_VA" | "SEEKING_WORK";

export interface FacebookPostLog {
  id: string;
  group_id: string;
  post_id: string;
  author_name: string;
  message: string | null;
  classification: PostClassification;
  created_time: string | null;
  notified: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reddit Monitor
// ---------------------------------------------------------------------------

export interface RedditPostLog {
  id: string;
  reddit_post_id: string;
  subreddit: string;
  author: string;
  title: string | null;
  body: string | null;
  classification: PostClassification;
  created_utc: string | null;
  notified: boolean;
  created_at: string;
}
