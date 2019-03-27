import Moleculer from "moleculer";

declare namespace APIGateway {

  namespace UnderlyingService {

    /* Service schema of underlying service. */
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

    /* Service actions can be published with api configurations in metadata. */
    interface APIConfig {
      rest?: RESTConfig
      graphql?: GraphQLConfig
    }

    /* Configuration to map service actions to REST endpoints. */
    interface RESTConfig {
      /*
        path: Optional root path for underlying service.

        If service name is "iam.user" and "users" is given as path, "/users/*" will be routed for the service.
        otherwise, "/iam.user/*" will be routed for the service endpoints.
      */
      path?: string

      /*
        aliases: Map actions to REST endpoint. All available alias methods are GET|HEAD|PUT|PATCH|POST|DELETE|(all for empty).

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

    /* REST alias mapping configuration. */
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

        2) HTTP params mapping.

        "GET /:id": {
          action: "iam.user.get",
          params: {
            withDisabled: "@.disabled"
          }
        }

        At first, path params is extracted as { id: 'string from part of URL path /:id' }.
        Be noted that the type of this value will be always string.

        Then, from a request of GET method:
          The params option { withDisabled: "@.disabled" } will make param { withDisabled: 'disabled value of the url query' } params.
          And here query string key is matched by in-case-sensitive.
          Also only for query string params, REST action resolver will cast param type to proper type to service action definition.

        And, from a request of other methods:
          Other params will be extracted from JSON body.

        This <HTTP params mapping> is implicitly tried among same named params without explicit configuration.
        When the names of path and query string are conflicted, path params has priority over the query string and body params.
       */
      params?: { [paramName: string]: any }


      /*
        multipart: File upload from HTML multipart form.

        All params will be ignored and action handler will got
      */
      multipart?: boolean

      /*
        stream: File upload from AJAX or cURL.
      */
      stream?: boolean
    }

    /* Configuration to extends GraphQL schema and map service actions to GraphQL schema resolver. */
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

    /* GraphQL resolver mapping configuration. */
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


    /* Service action would get below 'meta' from api gateway. */
    interface ActionContextMeta extends Moleculer.GenericObject {
      /* User data */
      user: any

      /* Locale data */
      locale: string

      /* UserAgent data */
      userAgent: any

      /*
        GraphQL request information:

        This field would be field when action called via GraphQL schema.
      */
      graphql?: {
        source: any
        args: any
        context: ActionGraphQLContext
        info: import("graphql").GraphQLResolveInfo
      }

      /*
        HTTP response transformation:

        To transform HTTP response of API Gateway, assign 'ctx.meta.$http' field in action handler.
        This transformation will not be applied when action called via GraphQL schema.
        Be noted that when the action has been called via GraphQL resolver, '$http' will be ignored by API Gateway.

        eg. from action definition.

        handler({ meta }) {
          // 1) make a redirect response.
          meta.$http = {
            statusCode: 301,
            headers: {
              "Location": "https://google.com",
            },
          };
          return;

          // 2) make a download response.
          meta.$http = {
            headers: {
              "Content-Disposition": "attachment; filename=\"anyFile.pdf\"",
            },
          };
          return fileStream; // ref: https://moleculer.services/docs/0.13/actions.html#Streaming

          // 3) make a HTML document response.
          meta.$http = {
            headers: {
              "Content-Type": "text/html",
            },
          };
          return "<html>....</html>";
        }
      */
      $http?: {
        headers?: { [key: string]: string }
        statusCode?: number
        statusMessage?: string
      }
    }

    // equal to action context meta; internal usage
    interface ActionGraphQLContext extends Exclude<ActionContextMeta, "graphql"> {
      moleculer?: Moleculer.Context
      _extensionStack?: any
    }

    interface Action extends Moleculer.Action {
      handler?: ActionHandler;
    }

    type ActionHandler<T = any> = ((ctx: Moleculer.Context<Moleculer.GenericObject, ActionContextMeta>) => PromiseLike<T> | T) & ThisType<Moleculer.Service>;
  }

  // internal usage
  interface APISyncRequest extends Moleculer.GenericObject {
    services: UnderlyingService.ServiceSchema[]
    alwaysPreferLatestService: boolean
  }

  namespace CatalogService {
    /*
      Subscribe reports from API Gateway:

      Subscribe to 'api.catalog.report.<serviceName>' to get messages form API Gateway.

      eg. from service schema.

      events: {
        // listen to messages from API Gateway toward this service
        "api.catalog.report.<serviceName>"(report: CatalogService.ServiceReport) {
          this.logger.info(`[Gateway@${report.gatewayNodeID} => ${report.serviceName}]`, report.messages);
        },

        // listen to related service messages
        "api.catalog.report.<serviceName>**"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to all the messages from API Gateway
        "api.catalog.report.**"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to api gateway status messages
        "api.catalog.report.api"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to api gateway GraphQL server related messages
        "api.catalog.report.api.graphql"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to both
        "api.catalog.report.api**"(report: CatalogService.ServiceReport) {
          // ...
        },
      },
    */
    interface ServiceReport {
      serviceName: string
      gatewayNodeID: string
      messages: any[]
      createdAt: Date
    }
  }
}

export = APIGateway;
