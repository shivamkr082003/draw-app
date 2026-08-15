import { RoomCanvas } from "@/components/RoomCanvas";

export default async function WorkspaceRoomPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    roomId: string;
  }>;
}) {
  const resolved = await params;
  const { workspaceId, roomId } = resolved;

  return <RoomCanvas roomId={roomId} workspaceId={workspaceId} />;
}
