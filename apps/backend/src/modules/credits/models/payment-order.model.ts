import mongoose, { type InferSchemaType, Schema } from "mongoose";

const paymentOrderSchema = new Schema(
  {
    orderCode: { type: Number, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true }, // VND
    credits: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled", "failed"],
      default: "pending",
      index: true,
    },
    paymentLinkId: { type: String },
    checkoutUrl: { type: String },
    qrCode: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

export type PaymentOrderDoc = InferSchemaType<typeof paymentOrderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PaymentOrderModel = mongoose.model("PaymentOrder", paymentOrderSchema);
