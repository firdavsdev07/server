const generateVerificationCode = (): { code: string; expires: Date } => {
  return {
    code: Math.floor(100000 + Math.random() * 900000).toString(),
    expires: new Date(Date.now() + 2 * 60 * 1000),
  };
};
export default generateVerificationCode;
