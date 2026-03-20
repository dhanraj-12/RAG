import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../config/s3";

const deleteFromS3 = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET as string,
    Key: key,
  });
  await s3Client.send(command);
};

export { deleteFromS3 };
