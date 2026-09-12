import mongoose from 'mongoose';

async function repairPaperCommentIndexes() {
  const collection = mongoose.connection.collection('papercomments');

  try {
    await collection.dropIndex('sourceRating_1');
  } catch (error) {
    if (error.codeName !== 'IndexNotFound') {
      throw error;
    }
  }

  await collection.createIndex(
    { sourceRating: 1 },
    {
      name: 'sourceRating_1',
      unique: true,
      partialFilterExpression: { sourceRating: { $type: 'objectId' } },
    }
  );
}

export async function connectDb() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/liemresearch';
  await mongoose.connect(mongoUri);
  await repairPaperCommentIndexes();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
