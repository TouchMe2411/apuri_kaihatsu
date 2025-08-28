export interface PostRecipient {
  students: RecipientStudent[];
  groups: RecipientGroup[];
}

export interface RecipientStudent {
  id: number;
  given_name: string;
  family_name: string;
  student_number: string;
}

export interface RecipientGroup {
  id: number;
  group_name: string;
}
