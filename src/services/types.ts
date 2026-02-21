export interface MarketData {
  id: number;
  question: string;
  deadline: number;
  creator: string;
  yesPool: string;
  noPool: string;
  outcome: "Pending" | "Yes" | "No";
  storageRoot: string;
}

export interface MarketMetadata {
  question: string;
  description: string;
  resolutionCriteria: string;
  sourceUrls: string[];
  tags: string[];
  createdAt: string;
}

export interface LiveMarketMetadata extends MarketMetadata {
  streamUrl: string;
  machineFiJobId: string;
  condition: string;
}

export interface ResolutionResult {
  outcome: boolean;
  confidence: number;
  reasoning: string;
  sources: string[];
  resolvedAt: string;
}

export interface ResolutionEvidence {
  marketId: number;
  question: string;
  result: ResolutionResult;
  aiModel: string;
  prompt: string;
}
