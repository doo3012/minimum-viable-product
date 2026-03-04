import { z } from 'zod';

export const onboardSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  address: z.string().min(1, 'Address is required').max(500),
  contactNumber: z.string().min(1, 'Contact number is required').max(20),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
});

export type OnboardFormData = z.infer<typeof onboardSchema>;
