export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
// RPC-only application access. JSON return values are validated by Zod at the API boundary.
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      learning_snapshot: { Args: { p_version: string }; Returns: Json };
      answer_question: {
        Args: {
          p_attempt_id: string;
          p_generation: number;
          p_version: string;
          p_lesson_id: string;
          p_quiz_id: string;
          p_question_id: string;
          p_option_id: string;
        };
        Returns: Json;
      };
      complete_lesson: {
        Args: { p_version: string; p_lesson_id: string; p_generation: number };
        Returns: Json;
      };
      touch_position: {
        Args: {
          p_version: string;
          p_lesson_id: string;
          p_block_id: string | null;
          p_session_id: string;
          p_sequence: number;
          p_generation: number;
        };
        Returns: undefined;
      };
      review_mistake: { Args: { p_response_id: string; p_generation: number }; Returns: undefined };
      reset_learning: {
        Args: { p_request_id: string; p_version: string; p_generation: number };
        Returns: Json;
      };
      learning_export: { Args: Record<string, never>; Returns: Json };
    };
  };
};
