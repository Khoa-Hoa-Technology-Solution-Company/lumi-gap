import mongoose, { type InferSchemaType, Schema } from "mongoose";

const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetKind: {
      type: String,
      enum: ["paper", "report"],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    note: { type: String, maxLength: 500 },
  },
  { timestamps: true }
);

// Unique compound index to prevent duplicate bookmarks per user
bookmarkSchema.index({ userId: 1, targetKind: 1, targetId: 1 }, { unique: true });

export type BookmarkDoc = InferSchemaType<typeof bookmarkSchema> & { _id: mongoose.Types.ObjectId };
export type BookmarkHydrated = mongoose.HydratedDocument<InferSchemaType<typeof bookmarkSchema>>;

// Explicit collection name "bookmarks" as per TEAM_ASSIGNMENT.md
export const BookmarkModel = mongoose.model("Bookmark", bookmarkSchema, "bookmarks");
