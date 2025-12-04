import jwt from "jsonwebtoken";
import IJwtUser from "../types/user";
// import IJwtRegisterKey from "../types/registerKey";

class Jwt {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private registrationTokenSecret: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_KEY || "";
    this.refreshTokenSecret = process.env.JWT_REFRESH_KEY || "";

    if (!this.accessTokenSecret || !this.refreshTokenSecret) {
      throw new Error("JWT keys are not defined in environment variables");
    }
  }

  sign(payload: IJwtUser) {
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: "1h",
    });
    const refreshToken = jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: "7d",
    });
    return { accessToken, refreshToken };
  }

  signBot(payload: IJwtUser) {
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: "1d",
    });

    return accessToken;
  }
  signrefresh(payload: IJwtUser) {
    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: "1h",
    });
    return accessToken;
  }

  validateRefreshToken(token: string): IJwtUser | null {
    try {
      return jwt.verify(token, this.refreshTokenSecret) as IJwtUser;
    } catch (error) {
      return null;
    }
  }

  validateAccessToken(token: string): IJwtUser | null {
    try {
      return jwt.verify(token, this.accessTokenSecret) as IJwtUser;
    } catch (error) {
      return null;
    }
  }
}

export default new Jwt();
