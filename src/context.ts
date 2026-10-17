export type AuthContext = { kind: "token"; id: string; name: string } | { kind: "disabled" };

export type AppEnv = {
  Variables: {
    requestId: string;
    auth: AuthContext;
  };
};
