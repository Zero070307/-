export type StudentCourse = {
  type: string;
  hours: number;
};

export type Student = {
  id: string;
  name: string;
  phone?: string;
  className: string;
  courses: StudentCourse[];
  note?: string;
  createdAt: string;
  studentNo?: string;
  archived?: boolean;
};

export type AttendanceRecord = {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  course: string;
  time: string;
  remainHours: number;
  note?: string;
  archiveName?: string;
};

export type AppState = {
  students: Student[];
  history: AttendanceRecord[];
};
