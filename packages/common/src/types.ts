
import { z } from "zod";


export const CreateUserSchema = z.object({
    email: z.string().min(3).max(30),
    password: z.string(),
    name: z.string()
})


export const SigninSchema = z.object({
    email: z.string().min(3).max(30),
    password: z.string()
})

export const CreateRoomSchema = z.object({
    name: z.string().min(2).max(50),   // room name / slug
    workspaceId: z.string().optional(),
});

export const CreateWorkspaceSchema = z.object({
    name: z.string().min(2, "Workspace name must be at least 2 characters").max(50, "Workspace name must be at most 50 characters"),
    description: z.string().max(200, "Description must be at most 200 characters").optional(),
});

export const UpdateWorkspaceSchema = z.object({
    name: z.string().min(2, "Workspace name must be at least 2 characters").max(50, "Workspace name must be at most 50 characters").optional(),
    description: z.string().max(200, "Description must be at most 200 characters").optional(),
});

export const CreateWorkspaceRoomSchema = z.object({
    name: z.string().min(2, "Room name must be at least 2 characters").max(50, "Room name must be at most 50 characters"),
    slug: z.string().min(2).max(50).optional(),
});

export const JoinRoomSchema = z.object({
    workspaceId: z.string().min(1, "Workspace ID is required"),
    roomId: z.string().min(1, "Room ID is required"),
});