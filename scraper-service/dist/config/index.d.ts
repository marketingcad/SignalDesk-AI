export declare const config: {
    backendApiUrl: string;
    backendAuthToken: string;
    discordWebhookUrl: string;
    port: number;
    cron: {
        reddit: string;
        x: string;
        linkedin: string;
        facebook: string;
    };
    targets: {
        redditSubreddits: string[];
        xSearchQueries: string[];
        linkedinSearchQueries: string[];
        facebookSearchQueries: string[];
        facebookGroupUrls: string[];
    };
    maxResultsPerRun: number;
    scrollDelayMs: number;
    requestTimeoutMs: number;
    headless: boolean;
};
