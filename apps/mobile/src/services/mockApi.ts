export interface TrendingTopic {
  id: string;
  title: string;
  trendPercentage: number;
  dataPoints: number[];
}

export interface Paper {
  id: string;
  title: string;
  authors: string;
  citations: number;
  aiScore: number;
  isBookmarked: boolean;
}

export const getTrendingTopics = async (): Promise<TrendingTopic[]> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 600));

  return [
    {
      id: "1",
      title: "LLM in education",
      trendPercentage: 24,
      dataPoints: [20, 30, 45, 60, 50, 75, 100],
    },
    {
      id: "2",
      title: "RAG systems",
      trendPercentage: 18,
      dataPoints: [10, 15, 30, 25, 45, 60, 80],
    },
    {
      id: "3",
      title: "Quantum Computing",
      trendPercentage: 12,
      dataPoints: [5, 10, 15, 20, 30, 35, 50],
    },
  ];
};

export const getRecentPapers = async (): Promise<Paper[]> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  return [
    {
      id: "101",
      title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
      authors: "Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio...",
      citations: 87,
      aiScore: 0.92,
      isBookmarked: true,
    },
    {
      id: "102",
      title: "Evaluating Large Language Models in Higher Education",
      authors: "Sarah Johnson, Mark Davis, Emily Chen",
      citations: 42,
      aiScore: 0.85,
      isBookmarked: false,
    },
    {
      id: "103",
      title: "Efficient Transformers: A Survey",
      authors: "Yi Tay, Mostafa Dehghani, Dara Bahri, Donald Metzler",
      citations: 312,
      aiScore: 0.89,
      isBookmarked: true,
    },
  ];
};
