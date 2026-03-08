export interface ConversationState {
  intent?: string;
  doctorId?: string | null;
  date?: string | null;
  awaitingSlotSelection?: boolean;
  isRescheduling?: boolean;
  campaignType?: string;
}
