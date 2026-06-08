"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookEvent = exports.ExportFormat = exports.PlanType = exports.ConfidenceLevel = exports.EnrichmentMode = exports.JobItemStatus = exports.JobStatus = void 0;
var JobStatus;
(function (JobStatus) {
    JobStatus["QUEUED"] = "queued";
    JobStatus["RUNNING"] = "running";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["PARTIAL"] = "partial";
    JobStatus["CANCELLED"] = "cancelled";
    JobStatus["FAILED"] = "failed";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
var JobItemStatus;
(function (JobItemStatus) {
    JobItemStatus["QUEUED"] = "queued";
    JobItemStatus["PROCESSING_HTTP"] = "processing_http";
    JobItemStatus["PROCESSING_BROWSER"] = "processing_browser";
    JobItemStatus["COMPLETED"] = "completed";
    JobItemStatus["PARTIAL"] = "partial";
    JobItemStatus["FAILED"] = "failed";
    JobItemStatus["BLOCKED"] = "blocked";
    JobItemStatus["BROWSER_TIMEOUT"] = "browser_timeout";
    JobItemStatus["INSUFFICIENT_CREDITS"] = "insufficient_credits";
})(JobItemStatus || (exports.JobItemStatus = JobItemStatus = {}));
var EnrichmentMode;
(function (EnrichmentMode) {
    EnrichmentMode["FAST_HTTP"] = "fast_http";
    EnrichmentMode["SMART_HYBRID"] = "smart_hybrid";
    EnrichmentMode["PREMIUM_JS"] = "premium_js";
})(EnrichmentMode || (exports.EnrichmentMode = EnrichmentMode = {}));
var ConfidenceLevel;
(function (ConfidenceLevel) {
    ConfidenceLevel["HIGH"] = "high_confidence";
    ConfidenceLevel["MEDIUM"] = "medium_confidence";
    ConfidenceLevel["LOW"] = "low_confidence";
})(ConfidenceLevel || (exports.ConfidenceLevel = ConfidenceLevel = {}));
var PlanType;
(function (PlanType) {
    PlanType["STARTER"] = "starter";
    PlanType["GROWTH"] = "growth";
    PlanType["PRO"] = "pro";
})(PlanType || (exports.PlanType = PlanType = {}));
var ExportFormat;
(function (ExportFormat) {
    ExportFormat["CSV"] = "csv";
    ExportFormat["JSON"] = "json";
})(ExportFormat || (exports.ExportFormat = ExportFormat = {}));
var WebhookEvent;
(function (WebhookEvent) {
    WebhookEvent["JOB_COMPLETED"] = "job.completed";
    WebhookEvent["ITEM_COMPLETED"] = "item.completed";
    WebhookEvent["EXPORT_READY"] = "export.ready";
})(WebhookEvent || (exports.WebhookEvent = WebhookEvent = {}));
//# sourceMappingURL=enums.js.map