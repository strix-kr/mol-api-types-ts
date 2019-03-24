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
      } & Moleculer.GenericObject;
    }

    // Service actions will be published by following the given configurations.
    interface APIConfig {
      rest?: RESTConfig
      graphql?: GraphQLConfig
      guard?: GuardConfig
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
        schema: Either a string or strings which defines the GraphQL schema for the service.

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
      schema: string

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
        batch: If true, API Gateway will use the batch loader (GraphQL DataLoader) to resolve the given field.
        In this case, the mapped action should be able to serve the request with batching for first param.

        "User.post": {
          action: "post.get",
          batch: true
        }

        In above example, "post.get({ id, ... })" action should be able to serve { id: ["post-1", "post-2", ...] } request.
       */
      batch?: boolean

      /*
        ignoreError: If true, "null" will be returned on error.
       */
      ignoreError?: boolean
    }


    // Guard configuration to protect action call via Either GraphQL or REST endpoint.
    interface GuardConfig {
      // TODO: 1 GUARD with IAM.USER/ADMIN Context
    }

    // Action Metadata of underlying service.
    interface ActionMeta extends Moleculer.GenericObject {
      api?: ActionAPIMeta
    }

    // Underlying services can use below meta data to deal with requests from API Gateway.
    interface ActionAPIMeta extends APIRequestContext {
      graphql: { source: any, args: any, context: GraphQLRequestContext, info: GraphQLResolveInfo }
    }

    interface APIRequestContext {
      // TODO: guard integration...
      user: any
      locale: string
    }

    // Internal usage
    interface GraphQLRequestContext extends APIRequestContext {
      moleculer?: Moleculer.Context
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
