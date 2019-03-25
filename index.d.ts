import Moleculer from "moleculer";
import { GraphQLResolveInfo } from "graphql";

declare namespace APIGateway {

  namespace UnderlyingService {

    // Service schema of underlying service.
    interface ServiceSchema extends Moleculer.ServiceSchema {
      // Metadata of underlying service.
      metadata?: {
        // API Gateway Service will seek only the "api" field of service metadata.
        api?: APIConfig

        // Internal usage to compare api configuration between same named services.
        apiVersion?: string
      } & Moleculer.GenericObject

      actions:  { [key: string]: Action | ActionHandler }
    }

    // Service action interface of underlying service.
    interface Action extends Moleculer.Action {
      handler?: ActionHandler;
    }

    type ActionHandler<T = any> = ((ctx: Moleculer.Context<Moleculer.GenericObject, ActionContextMeta>) => PromiseLike<T> | T) & ThisType<Moleculer.Service>;

    // Service action would get below 'meta' from api gateway.
    interface ActionContextMeta extends Moleculer.GenericObject {
      graphql?: { source: any, args: any, context: ActionGraphQLContext, info: GraphQLResolveInfo }
      user?: any
      locale?: string
    }

    // equal to action context meta
    interface ActionGraphQLContext extends Exclude<ActionContextMeta, "graphql"> {
      moleculer?: Moleculer.Context // internal usage
    }

    // Service actions can be published with api configurations in metadata.
    interface APIConfig {
      rest?: RESTConfig
      graphql?: GraphQLConfig
    }

    // Configuration to map service actions to REST endpoints.
    interface RESTConfig {
      /*
        path: Optional root path for underlying service.

        If service name is "iam.user" and "users" is given as path, "/users/*" will be routed for the service.
        otherwise, "/iam.user/*" will be routed for the service endpoints.
      */
      path?: string

      /*
        aliases: Map actions to REST endpoint.

        "POST login": "iam.user.issueToken"
        => POST /users/login        => iam.user.issueToken

        "POST /": "iam.user.create"
        => POST /users              => iam.user.create

        "GET /:id": "iam.user.get"
        => GET /users/:id           => iam.user.get
           :id param will be used to call iam.user.get action.
           Also any params from query string will be merged into the params to call the action.

        "REST /": "iam.user"
        => GET    /users            => iam.user.list
           GET    /users/:id        => iam.user.get
           POST   /users            => iam.user.create
           PUT    /users            => iam.user.update
           DELETE /users/:id        => iam.user.remove

        "/some/path": "iam.user.any"
        => *      /users/some/path  => iam.user.any
      */
      aliases: {
        [alias: string]: RESTAliasConfig
      }
    }

    // REST alias mapping configuration.
    interface RESTAliasConfig {
      /*
        action: The name of action to map to REST alias.
       */
      action: string
    }


    // Configuration to extends GraphQL schema and map service actions to GraphQL schema resolver.
    interface GraphQLConfig {
      /*
        typeDefs: Either a string or strings which defines the GraphQL schema for the service.

        `
        extend Query {
          user(id: ID!) User!
        }

        type User {
          id: ID!
          email: String!
          posts: [Post!]!
        }

        extend type Post {
           author: User
        }
        `
      */
      typeDefs: string | string[]

      /*
        resolvers: Defines the ways to resolve the given schema.

        "Query.user": {...}
        "User.posts": {...}
        "Post.author": {...}
       */
      resolvers: {
        [field: string]: GraphQLResolverConfig
      }
    }

    // GraphQL resolver mapping configuration.
    interface GraphQLResolverConfig {
      /*
        action: The name of action to map to resolver.
       */
      action: string

      /*
        params: Params key/value map to call the given action.

        1) Map a param from field params.
        The params option { id: "@.id" } will make resolver to call the action "post.get" with { userId: 'id value of the field params' } params.
        "Query.user": {
          action: "iam.user.get",
          params: {
            id: "@.id"
          }
        }

        2) Map a param from the root object props.
        The params option { userId: "$.id" } will make resolver to call the action "post.get" with { userId: 'id value of the root object props' } params.
        "User.post": {
          action: "post.get",
          params: {
            userId: "$.id"
          }
        }

        3) Define a param value directly.
        Otherwise, given primitive value will be used directly to call the action.
        "Query.user": {
          action: "iam.user.get",
          params: {
            ignoreDisabledUser: true
          }
        }
       */
      params?: { [paramName: string]: any }

      /*
        paramsWithBatch: If any param names given, API Gateway will use the batch loader (GraphQL DataLoader) to resolve the given field.
        In this case, the mapped action should be able to serve the request with batched params.

        "Query.user": {
          action: "iam.user.get",
          params: {
            id: "@.id"
          }
          paramsWithBatch: ["id"]
        }

        Then "iam.user.get" action should be able to serve the request with { id: ["user-1", "user-2", ...] } params.

        "User.post": {
          action: "post.get",
          params: {
            userId: "$.id"
          },
          paramsWithBatch: ["userId"]
        }

        In above example, "post.get" action should be able to serve { userId: ["user-1", "user-2", ...] } params.
       */
      paramsWithBatch?: string[]

      /*
        ignoreError: If true, "null" will be returned on error.
       */
      ignoreError?: boolean
    }
  }

  // internal usage
  interface APISyncRequest extends Moleculer.GenericObject {
    services: UnderlyingService.ServiceSchema[]
    alwaysPreferLatestService: boolean
  }

  namespace CatalogService {
    interface ServiceReport {
      service: UnderlyingService.ServiceSchema
      errors?: any[],
      warnings?: any[],
      createdAt?: Date,
    }
  }
}

export = APIGateway;
