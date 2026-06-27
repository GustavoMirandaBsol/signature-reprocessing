export interface Position {
  LetfCoordinateX: number;
  RightCoordinateX: number;
  CoordinateUpY: number;
  CoordinateDownY: number;
}

export interface Signatory {
  UserNameSignatory: string;
  SigningRepresentative: number;
  SignatureFlow: number;
  ClientDirectoryId: string;
  ClientGuid: string;
  InterviewId: string;
  VerifyOtp: string;
  PageSign: number;
  UseDefaultDirectory: boolean;
  Position: Position;
}

export interface SignSetting {
  Signatories: Signatory[];
}

export interface SigningDocument {
  DocumentId: string;
  DocumentType: number;
  SingSetting: SignSetting;
  TopicName: string;
}

export interface SigningRequest {
  Channel: number;
  FlowType: number;
  NotificationSignedDocument: string | null;
  DocumentDirectoryId: string;
  DocumentOwnerComplete: boolean;
  Documents: SigningDocument[];
}

export interface ReprocessJob {
  id: string;
  documentId: string;
  documentName: string;
  signingRepresentative: number;
  participantLabel: string;
  interviewId: string;
  directoryId: string;
  startedAt: string;
  status: "loading" | "completed" | "error";
  response?: unknown;
  clientGuid?: string;
  payloadFile?: string;
  postUrl?: string;
  curlCommand?: string;
  manualResult?: "success" | "failed" | null;
  completedAt?: string;
}
