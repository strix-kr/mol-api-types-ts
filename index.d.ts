import Moleculer from "moleculer";

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
      user?: any
      locale?: string

      // graphql request information
      graphql?: { source: any, args: any, context: ActionGraphQLContext, info: import("graphql").GraphQLResolveInfo }

      // assign below fields on the context of action handler to handle the response of API Gateway
      $responseHeaders?: { [key: string]: string },
      $statusCode?: number
      $statusMessage?: string
      $responseType?: string
      $location?: string
    }

    // equal to action context meta; internal usage
    interface ActionGraphQLContext extends Exclude<ActionContextMeta, "graphql"> {
      moleculer?: Moleculer.Context
      _extensionStack?: any
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

      /*
        params: Params key/value map to call the given action.

        1) Primitive value mapping.
        Primitive values can be mapped manually. And this has priority over all other mappings.
        Useful to protect internal variables from being implicitly mapped from URL params.

        "GET /:id": {
          action: "iam.user.get",
          params: {
            withDisabled: false
          }
        }

        2) URL mapping (path params and query string).
        The params option { id: "@.id" } will make resolver to call the action "iam.user.get" with { id: 'id value of the url params' } params.
        This <URL mapping> is implicitly tried among same named params without explicit configuration.
        When the names of path params and query string are conflicted, path params has priority over the query string.

        "GET /:id": {
          action: "iam.user.get",
          params: {
            withDisabled: "@.disabled"
          }
        }
       */
      params?: { [paramName: string]: any }
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
        [fieldName: string]: GraphQLResolverConfig
      },

      /*
        nodeResolvers: Optionally define the ways to resolve 'node(id: "type-name:xxx"): Node!' query for the types which implement Node interface.

        "File": {...}
       */
      nodeResolvers?: {
        [typeName: string]: GraphQLActionResolverConfig
      },
    }

    // GraphQL resolver mapping configuration.
    type GraphQLResolverConfig = GraphQLActionResolverConfig  | GraphQLSubscriptionResolverConfig

    interface GraphQLActionResolverConfig {
      /*
        action: The name of action to map to resolver.
       */
      action: string

      /*
        params: Params key/value map to call the given action.

        1) Primitive value mapping.
        Primitive values can be mapped manually. And this has priority over all other mappings.

        "Query.user": {
          action: "iam.user.get",
          params: {
            withDisabled: false
          }
        }

        2) Field arguments mapping.
        The params option { id: "@.id" } will make resolver to call the action "iam.user.get" with { id: 'value of the field argument id' } params.
        This <Field arguments mapping> is implicitly tried among same named params without explicit configuration.

        "Query.user": {
          action: "iam.user.get",
          params: {
            id: "@.id"
          }
        }

        3) Source object mapping.
        The params option { userId: "$.id" } will make resolver to call the action "post.get" with { userId: 'value of the source object prop id' } params.
        This <Source object mapping> is implicitly tried among same named params without explicit configuration after <Field argument mapping> failed.

        "User.post": {
          action: "post.get",
          params: {
            userId: "$.id"
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
        ignoreError: If true, "null" will be returned on error. Not affected on non-nullable fields.
       */
      ignoreError?: boolean
    }

    interface GraphQLSubscriptionResolverConfig {
      event: string
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
