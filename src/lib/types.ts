export interface Article {
  articleId: number;
  menuId: number;
  subject: string;
  writerNickname: string;
  writeDateTimestamp: number;
  readCount: number;
  commentCount: number;
  likeItCount: number;
  representImage: string;
  headName: string;
}

export interface BoardArticles {
  menuId: number;
  menuName: string;
  articles: Article[];
  fetchedAt: string;
}

export interface StoredData {
  boards: BoardArticles[];
  lastUpdated: string;
}

export interface CrawlResult {
  boards: BoardArticles[];
  newArticles: Record<number, Article[]>;
  lastUpdated: string;
  stats: CrawlStats;
}

export interface CrawlStats {
  totalArticles: number;
  totalNew: number;
  perBoard: { menuId: number; total: number; new: number }[];
}
