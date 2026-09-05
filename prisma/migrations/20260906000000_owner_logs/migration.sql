CREATE TABLE "operational_logs" (
  "id" UUID NOT NULL,
  "time" TIMESTAMPTZ(3) NOT NULL,
  "level" VARCHAR(8) NOT NULL CHECK ("level" IN ('info', 'error')),
  "event" VARCHAR(32) NOT NULL,
  "request_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "operational_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_logs_time_id_idx" ON "operational_logs"("time", "id");
CREATE INDEX "operational_logs_level_time_id_idx" ON "operational_logs"("level", "time", "id");
CREATE INDEX "operational_logs_request_id_idx" ON "operational_logs"("request_id");
