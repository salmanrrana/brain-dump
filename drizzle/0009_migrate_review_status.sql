-- Migration: Convert deprecated 'review' status to 'ai_review'
-- This migrates any tickets with status='review' to status='ai_review'
-- as part of the Universal Quality Workflow status cleanup

UPDATE tickets SET status = 'ai_review' WHERE status = 'review';
