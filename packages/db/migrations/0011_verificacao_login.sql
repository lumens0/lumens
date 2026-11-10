CREATE TABLE "verificacao_login" (
	"identificador" text NOT NULL,
	"token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	CONSTRAINT "verificacao_login_identificador_token_pk" PRIMARY KEY("identificador","token")
);
