import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { ticketComments } from "../lib/schema";
import type { TicketComment } from "../lib/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  BASE_COMMENT_AUTHORS,
  isValidCommentAuthor,
  type BaseCommentAuthor,
  type CommentAuthor,
} from "../lib/comment-authors";

// Comment types — derived from schema's $type<>() annotations
export type Comment = TicketComment;
export type CommentType = TicketComment["type"];
export type { BaseCommentAuthor, CommentAuthor };

export interface CreateCommentInput {
  ticketId: string;
  content: string;
  author: CommentAuthor;
  type?: CommentType;
}

// Valid authors and types for validation
const VALID_AUTHORS = [...BASE_COMMENT_AUTHORS];
const VALID_TYPES: CommentType[] = ["comment", "work_summary", "test_report", "progress"];

// Get comments for a ticket
export const getComments = createServerFn({ method: "GET" })
  .inputValidator((data: string) => {
    if (!data || typeof data !== "string") {
      throw new Error("Ticket ID is required");
    }
    // Basic UUID format validation
    if (!/^[a-zA-Z0-9-]+$/.test(data)) {
      throw new Error("Invalid ticket ID format");
    }
    return data;
  })
  .handler(async ({ data: ticketId }): Promise<Comment[]> => {
    const comments = db
      .select()
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(desc(ticketComments.createdAt))
      .all();

    return comments;
  });

// Create a new comment
export const createComment = createServerFn({ method: "POST" })
  .inputValidator((data: CreateCommentInput) => {
    if (!data.ticketId || typeof data.ticketId !== "string") {
      throw new Error("Ticket ID is required");
    }
    if (!/^[a-zA-Z0-9-]+$/.test(data.ticketId)) {
      throw new Error("Invalid ticket ID format");
    }
    if (!data.content || typeof data.content !== "string") {
      throw new Error("Comment content is required");
    }
    if (data.content.length > 100000) {
      throw new Error("Comment content exceeds maximum length of 100,000 characters");
    }
    if (!data.author || !isValidCommentAuthor(data.author)) {
      throw new Error(`Invalid author. Must be one of: ${VALID_AUTHORS.join(", ")}`);
    }
    if (data.type && !VALID_TYPES.includes(data.type)) {
      throw new Error(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
    }
    return data;
  })
  .handler(async ({ data }): Promise<Comment> => {
    const { ticketId, content, author, type = "comment" } = data;

    const id = randomUUID();

    db.insert(ticketComments)
      .values({
        id,
        ticketId,
        content,
        author,
        type,
      })
      .run();

    const comment = db.select().from(ticketComments).where(eq(ticketComments.id, id)).get();

    if (!comment) {
      throw new Error("Failed to create comment");
    }

    return comment;
  });

// Delete a comment
export const deleteComment = createServerFn({ method: "POST" })
  .inputValidator((data: string) => {
    if (!data || typeof data !== "string") {
      throw new Error("Comment ID is required");
    }
    // Basic UUID format validation
    if (!/^[a-zA-Z0-9-]+$/.test(data)) {
      throw new Error("Invalid comment ID format");
    }
    return data;
  })
  .handler(async ({ data: commentId }): Promise<{ success: boolean }> => {
    db.delete(ticketComments).where(eq(ticketComments.id, commentId)).run();
    return { success: true };
  });
