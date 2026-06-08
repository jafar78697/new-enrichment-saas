export declare enum JobStatus {
    QUEUED = "queued",
    RUNNING = "running",
    COMPLETED = "completed",
    PARTIAL = "partial",
    CANCELLED = "cancelled",
    FAILED = "failed"
}
export declare enum JobItemStatus {
    QUEUED = "queued",
    PROCESSING_HTTP = "processing_http",
    PROCESSING_BROWSER = "processing_browser",
    COMPLETED = "completed",
    PARTIAL = "partial",
    FAILED = "failed",
    BLOCKED = "blocked",
    BROWSER_TIMEOUT = "browser_timeout",
    INSUFFICIENT_CREDITS = "insufficient_credits"
}
export declare enum EnrichmentMode {
    FAST_HTTP = "fast_http",
    SMART_HYBRID = "smart_hybrid",
    PREMIUM_JS = "premium_js"
}
export declare enum ConfidenceLevel {
    HIGH = "high_confidence",
    MEDIUM = "medium_confidence",
    LOW = "low_confidence"
}
export declare enum PlanType {
    STARTER = "starter",
    GROWTH = "growth",
    PRO = "pro"
}
export declare enum ExportFormat {
    CSV = "csv",
    JSON = "json"
}
export declare enum WebhookEvent {
    JOB_COMPLETED = "job.completed",
    ITEM_COMPLETED = "item.completed",
    EXPORT_READY = "export.ready"
}
//# sourceMappingURL=enums.d.ts.map