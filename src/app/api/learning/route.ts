import { curriculum } from "@/lib/curriculum";
import { emptySnapshot, learningSnapshotSchema } from "@/lib/learning/contracts";
import { apiFailure, learningIdentity, privateHeaders } from "@/lib/learning/server";
export async function GET() {
  try {
    const { client, user } = await learningIdentity();
    if (!client || !user)
      return Response.json(
        { mode: "preview", configured: !!client, user: null, snapshot: emptySnapshot },
        { headers: privateHeaders },
      );
    const { data, error } = await client.rpc("learning_snapshot", {
      p_version: curriculum.contentVersion,
    });
    if (error) throw error;
    return Response.json(
      {
        mode: "persistent",
        configured: true,
        user: { id: user.id, email: user.email ?? "" },
        snapshot: learningSnapshotSchema.parse(data),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
