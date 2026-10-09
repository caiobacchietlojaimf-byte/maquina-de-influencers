import type { CaptionGoal } from "./publish-caption";

export type PublicationSuggestion = {
  videoId: string;
  caption: string;
  alternatives: Array<{ label: string; caption: string }>;
  keywords: string[];
  hashtags: string[];
  goal: CaptionGoal;
  source: { title: string; kind: "reference-caption" | "reference-context" | "video-context"; url?: string; observedAt?: string };
  method: "ai" | "context";
  generatedAt: number;
  notice?: string;
};

export type InstagramPerformance = {
  status: "ready" | "disconnected" | "unavailable";
  username?: string;
  checkedAt: number;
  sampleSize: number;
  posts: Array<{ id: string; caption: string; permalink?: string; timestamp?: string; likes?: number; comments?: number; views?: number; reach?: number; saved?: number; shares?: number }>;
  summary: string;
  recommendations: string[];
  metricsAvailable: string[];
};
