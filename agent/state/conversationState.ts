export interface ConversationState {
  intent?: string;
  doctorId?: string | null;
  date?: string | null;
  //   step?: string;
}

// export function createInitialState(intent: string): ConversationState {
//   return {
//     intent,
//     doctorId: null,
//     date: null,
//     step: "ask_doctor",
//   };
// }
