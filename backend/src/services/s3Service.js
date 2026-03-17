const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../config/s3");

const deleteFromS3 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  });
  await s3Client.send(command);
};

module.exports = { deleteFromS3 };
